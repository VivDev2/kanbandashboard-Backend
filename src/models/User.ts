// server/src/models/User.ts
import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

// Mongoose IUser interface
export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  isActive: boolean;
  team?: Types.ObjectId; // Add this if you want to reference team directly on user
  permissions?: string[];
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Password comparison method
userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

const User = model<IUser>('User', userSchema);
export default User;