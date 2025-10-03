// server/src/socket/index.ts (Auth only version)
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { SocketUser } from '../types/';

interface CustomSocket extends Socket {
  user?: SocketUser;
  userId?: string;
  role?: 'admin' | 'user';
}

const initializeSocket = (io: Server) => {
  // Authentication middleware
  io.use(async (socket: CustomSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.user = {
        userId: user._id.toString(),
        name: user.name,
        role: user.role
      };
      socket.userId = user._id.toString();
      socket.role = user.role;
      
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  // Connection handler with room joining
  io.on('connection', (socket: CustomSocket) => {
    console.log(`User ${socket.user?.name} connected with role: ${socket.role}`);
    
    // Join room based on user ID for direct notifications
    if (socket.userId) {
      socket.join(socket.userId);
      console.log(`User ${socket.userId} joined their personal room`);
    }
    
    // Join room based on role for role-specific notifications
    if (socket.role) {
      socket.join(socket.role);
    }
    
    socket.on('disconnect', () => {
      console.log(`User ${socket.user?.name} disconnected`);
    });
  });
};

export default initializeSocket;