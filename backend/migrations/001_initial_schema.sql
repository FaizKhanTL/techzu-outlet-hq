-- Outlet HQ initial schema.
-- One company, many outlets. HQ owns the master menu and assigns items to outlets; each outlet keeps its own stock
-- and sells only what it was assigned. Money is integer minor units (cents). Every rule the database can hold is a
-- constraint here, so a bug in the application cannot break it.

-- Keeps updated_at current on every UPDATE, whatever writes the row.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Outlets -----------------------------------------------------------------------------------------------------------

CREATE TABLE outlets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short code printed on receipts (KLCC-000042).
  code        text        NOT NULL,
  name        text        NOT NULL,
  address     text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlets_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  CONSTRAINT outlets_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX outlets_code_key ON outlets (code);
CREATE TRIGGER outlets_set_updated_at BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Users -------------------------------------------------------------------------------------------------------------

CREATE TABLE users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text        NOT NULL,
  full_name      text        NOT NULL,
  password_hash  text        NOT NULL,
  role           text        NOT NULL,
  -- Outlet staff belong to exactly one outlet; HQ admins to none.
  outlet_id      uuid        REFERENCES outlets (id) ON DELETE RESTRICT,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_valid CHECK (role IN ('HQ_ADMIN', 'OUTLET_STAFF')),
  CONSTRAINT users_outlet_matches_role CHECK (
    (role = 'HQ_ADMIN' AND outlet_id IS NULL) OR (role = 'OUTLET_STAFF' AND outlet_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_outlet_id_idx ON users (outlet_id) WHERE outlet_id IS NOT NULL;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Master menu -------------------------------------------------------------------------------------------------------

CREATE TABLE menu_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text        NOT NULL,
  name              text        NOT NULL,
  description       text,
  category          text        NOT NULL DEFAULT 'General',
  base_price_cents  integer     NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_sku_format CHECK (sku ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  CONSTRAINT menu_items_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT menu_items_base_price_non_negative CHECK (base_price_cents >= 0)
);
CREATE UNIQUE INDEX menu_items_sku_key ON menu_items (sku);
CREATE INDEX menu_items_category_name_idx ON menu_items (category, name);
CREATE TRIGGER menu_items_set_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Which items an outlet may sell, at what price. -------------------------------------------------------------------

CREATE TABLE outlet_menu_items (
  outlet_id             uuid        NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
  menu_item_id          uuid        NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  -- NULL: the outlet sells at the master base price.
  price_override_cents  integer,
  -- An outlet can pause an item (sold out for the day, broken machine) without HQ unassigning it.
  is_available          boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outlet_id, menu_item_id),
  CONSTRAINT outlet_menu_items_override_non_negative CHECK (price_override_cents IS NULL OR price_override_cents >= 0)
);
-- "Which outlets sell this item" (reports, impact of a master change).
CREATE INDEX outlet_menu_items_menu_item_id_idx ON outlet_menu_items (menu_item_id);
CREATE TRIGGER outlet_menu_items_set_updated_at BEFORE UPDATE ON outlet_menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Stock per outlet per item -----------------------------------------------------------------------------------------

CREATE TABLE inventory (
  outlet_id     uuid        NOT NULL,
  menu_item_id  uuid        NOT NULL,
  quantity      integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outlet_id, menu_item_id),
  -- Stock exists only for an assigned item; unassigning removes it.
  FOREIGN KEY (outlet_id, menu_item_id) REFERENCES outlet_menu_items (outlet_id, menu_item_id) ON DELETE CASCADE,
  -- The last line of defence against overselling.
  CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0)
);
CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sales -------------------------------------------------------------------------------------------------------------

-- The next receipt number per outlet. Incremented inside the sale's transaction: the row lock serialises concurrent
-- sales of one outlet, and a rolled-back sale gives its number back, so numbers are sequential and gap-free.
CREATE TABLE outlet_receipt_counters (
  outlet_id  uuid    PRIMARY KEY REFERENCES outlets (id) ON DELETE CASCADE,
  last_seq   integer NOT NULL DEFAULT 0,
  CONSTRAINT outlet_receipt_counters_last_seq_non_negative CHECK (last_seq >= 0)
);

CREATE TABLE sales (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         uuid        NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
  receipt_seq       integer     NOT NULL,
  receipt_number    text        NOT NULL,
  total_cents       bigint      NOT NULL,
  item_count        integer     NOT NULL,
  payment_method    text        NOT NULL,
  note              text,
  -- Set by the client to make retries (and offline sync) safe: same key and body returns the same sale.
  idempotency_key   text,
  request_hash      text,
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_receipt_seq_positive CHECK (receipt_seq > 0),
  CONSTRAINT sales_total_non_negative CHECK (total_cents >= 0),
  CONSTRAINT sales_item_count_positive CHECK (item_count > 0),
  CONSTRAINT sales_payment_method_valid CHECK (payment_method IN ('CASH', 'CARD', 'E_WALLET')),
  CONSTRAINT sales_idempotency_pair CHECK ((idempotency_key IS NULL) = (request_hash IS NULL))
);
CREATE UNIQUE INDEX sales_outlet_receipt_seq_key ON sales (outlet_id, receipt_seq);
CREATE UNIQUE INDEX sales_receipt_number_key ON sales (receipt_number);
CREATE UNIQUE INDEX sales_outlet_idempotency_key ON sales (outlet_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Sales history of an outlet, newest first, and revenue for a date range.
CREATE INDEX sales_outlet_created_at_idx ON sales (outlet_id, created_at DESC, id DESC);
CREATE INDEX sales_created_at_idx ON sales (created_at);

CREATE TABLE sale_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           uuid    NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  menu_item_id      uuid    NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  -- Snapshots: the receipt stays right after the menu changes.
  sku               text    NOT NULL,
  name              text    NOT NULL,
  unit_price_cents  integer NOT NULL,
  quantity          integer NOT NULL,
  line_total_cents  bigint  NOT NULL,
  CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_items_unit_price_non_negative CHECK (unit_price_cents >= 0),
  CONSTRAINT sale_items_line_total_matches CHECK (line_total_cents = unit_price_cents::bigint * quantity),
  CONSTRAINT sale_items_one_line_per_item UNIQUE (sale_id, menu_item_id)
);
CREATE INDEX sale_items_menu_item_id_idx ON sale_items (menu_item_id);

-- Inventory ledger: every stock change, with why. --------------------------------------------------------------------

CREATE TABLE inventory_movements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       uuid        NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
  menu_item_id    uuid        NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  quantity_delta  integer     NOT NULL,
  quantity_after  integer     NOT NULL,
  reason          text        NOT NULL,
  sale_id         uuid        REFERENCES sales (id) ON DELETE SET NULL,
  note            text,
  created_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_delta_not_zero CHECK (quantity_delta <> 0),
  CONSTRAINT inventory_movements_after_non_negative CHECK (quantity_after >= 0),
  CONSTRAINT inventory_movements_reason_valid CHECK (reason IN ('RESTOCK', 'SALE', 'WASTE', 'CORRECTION')),
  -- A movement linked to a sale is a SALE movement (the link is cleared if the sale is ever removed).
  CONSTRAINT inventory_movements_sale_reason CHECK (sale_id IS NULL OR reason = 'SALE')
);
CREATE INDEX inventory_movements_outlet_item_created_idx
  ON inventory_movements (outlet_id, menu_item_id, created_at DESC);
CREATE INDEX inventory_movements_sale_id_idx ON inventory_movements (sale_id) WHERE sale_id IS NOT NULL;
