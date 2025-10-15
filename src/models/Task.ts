import { Schema, model, Document, Types } from "mongoose";

export interface ITask extends Document {
  title: string;
  description: string;
  status: "todo" | "in-progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  assignedTo: Types.ObjectId[];
  assignedBy: Types.ObjectId;
  dueDate?: Date;
  projectId?: Types.ObjectId; // 👈 ADD THIS
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["todo", "in-progress", "review", "done"],
      default: "todo",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dueDate: { type: Date },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" }, // 👈
  },
  { timestamps: true }
);

export default model<ITask>("Task", taskSchema);
