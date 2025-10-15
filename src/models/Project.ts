// server/src/models/Project.ts
import { Schema, model, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

export default model<IProject>('Project', projectSchema);