import { Request } from 'express';
import { IUser } from '../models/User'; // ← import the IUser from your model

// AuthRequest type for middleware
export interface AuthRequest extends Request {
  user?: IUser;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  permissions: string[];
}


export interface SocketUser {
  userId: string;
  name: string;
  role: 'admin' | 'user';
}
