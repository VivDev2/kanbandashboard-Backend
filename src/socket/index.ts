// server/src/socket/index.ts
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { SocketUser } from '../types';

interface CustomSocket extends Socket {
  user?: SocketUser;
  userId?: string;
  role?: 'admin' | 'user';
}

const initializeSocket = (io: Server) => {
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

  io.on('connection', (socket: CustomSocket) => {
    console.log(`User ${socket.user?.name} connected with role: ${socket.role}`);
    
    // Join room based on role
    if (socket.role) {
      socket.join(socket.role);
    }
    
    // Admin specific events
    socket.on('admin:requestAction', (data) => {
      // Broadcast to all users
      socket.to('user').emit('user:actionRequired', data);
    });
    
    socket.on('admin:updateDashboard', (data) => {
      io.emit('dashboard:update', data);
    });
    
    // User specific events
    socket.on('user:requestApproval', (data) => {
      // Send to all admins
      socket.to('admin').emit('admin:approvalRequest', {
        ...data,
        userId: socket.userId,
        userName: socket.user?.name
      });
    });
    
    socket.on('user:updateStatus', (data) => {
      // Notify admins of status change
      socket.to('admin').emit('admin:userStatusUpdate', {
        ...data,
        userId: socket.userId,
        userName: socket.user?.name
      });
    });
    
    // Real-time sync events
    socket.on('sync:request', (data) => {
      io.emit('sync:update', data);
    });
    
    socket.on('disconnect', () => {
      console.log(`User ${socket.user?.name} disconnected`);
    });
  });
};

export default initializeSocket;