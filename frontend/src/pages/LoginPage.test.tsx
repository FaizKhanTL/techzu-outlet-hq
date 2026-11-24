import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test/utils';

const renderLogin = (login = vi.fn()) =>
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>home page</p>} />
    </Routes>,
    { user: null, route: '/login', login },
  );

const fillAndSubmit = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginPage', () => {
  it('fills a demo account from its button', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Demo accounts'));
    fireEvent.click(screen.getByRole('button', { name: 'KLCC staff' }));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'klcc.staff@example.com',
    );
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('Password123!');
  });

  it('signs in with what was typed and goes home', async () => {
    const login = vi.fn().mockResolvedValue({});
    renderLogin(login);
    fillAndSubmit('hq@example.com', 'Password123!');
    expect(await screen.findByText('home page')).toBeTruthy();
    expect(login).toHaveBeenCalledWith('hq@example.com', 'Password123!');
  });

  it('shows the API message and re-enables the button when sign-in fails', async () => {
    renderLogin(
      vi
        .fn()
        .mockRejectedValue(
          new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'),
        ),
    );
    fillAndSubmit('a@b.co', 'wrong');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.'),
    );
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
