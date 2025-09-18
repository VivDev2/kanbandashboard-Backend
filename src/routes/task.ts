import express from "express";

const router = express.Router();

// Test route
router.get("/", (req, res) => {
  res.json({ message: "Task route is working 🚀" });
});

export default router;
