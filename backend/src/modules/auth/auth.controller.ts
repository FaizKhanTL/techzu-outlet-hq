import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { loginSchemas } from './auth.schemas';
import * as authService from './auth.service';

export async function login(req: Request, res: Response) {
  const { body } = validated(req, loginSchemas);
  res.json({ data: await authService.login(body.email, body.password) });
}

export async function me(req: Request, res: Response) {
  res.json({ data: await authService.getProfile(req.auth!.userId) });
}
