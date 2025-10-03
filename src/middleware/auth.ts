// server/src/middleware/auth.ts
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { AuthRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_this_in_production';

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };

      const user = await User.findById(decoded.id).select('-password') as IUser | null;

      if (!user) {
        res.status(401).json({ message: 'User not found' });
        return;
      }

      req.user = user;
      next();
      return;
    }

    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  } catch (err: any) {
    console.error('Auth error:', err.message);
    res.status(401).json({ message: 'Token failed' });
    return;
  }
};