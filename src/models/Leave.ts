// server/src/models/Leave.ts
import { Schema, model, Document, Types } from 'mongoose';
import { IUser } from './User';

export interface ILeave extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId; // Reference to the user who requested leave
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: Types.ObjectId; // Reference to admin who approved/rejected
  createdAt: Date;
  updatedAt: Date;
}

const leaveSchema = new Schema<ILeave>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  reason: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  approvedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, { timestamps: true });

const Leave = model<ILeave>('Leave', leaveSchema);
export default Leave;