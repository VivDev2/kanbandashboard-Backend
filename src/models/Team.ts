// server/src/models/Team.ts
import { Schema, model, Document, Types } from 'mongoose';
import User, { IUser } from './User';

export interface ITeam extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  project?: string;
  members: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  project: { type: String }, // Project the team is working on
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }] // References to users
}, { timestamps: true });

const Team = model<ITeam>('Team', teamSchema);
export default Team;