import { Router } from "express";
import { SupportTicketModel } from "../models/SupportTicketModel.js";
import { UserModel } from "../models/UserModel.js";
import { verifyToken, verifyRole } from "../middleware/VerifyToken.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  assignTicketSchema, createTicketSchema, ticketIdParamsSchema,
  ticketMessageSchema, ticketStatusSchema,
} from "../validation/supportSchemas.js";

const router = Router();

// POST /api/support — [customer] create a ticket
router.post("/", verifyToken, verifyRole("customer"), validateRequest(createTicketSchema), async (req, res) => {
  try {
    const { subject, category, relatedOrder, relatedReturn, message } = req.body;

    const ticket = await SupportTicketModel.create({
      customer: req.user._id,
      subject,
      category,
      relatedOrder,
      relatedReturn,
      messages: [{ sender: req.user._id, text: message }],
    });

    res.status(201).json({ message: "Support ticket created", ticket });
  } catch (err) {
    res.status(500).json({ message: "Could not create ticket", error: err.message });
  }
});

// GET /api/support — role-aware: customer sees own, support/admin see all (or assigned only)
router.get("/", verifyToken, async (req, res) => {
  try {
    const { status } = req.query;
    if (status && !["open", "in_progress", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid ticket status filter" });
    }
    let filter = {};

    if (req.user.role === "customer") {
      filter = { customer: req.user._id };
    } else if (req.user.role === "support") {
      filter = { $or: [{ assignedTo: req.user._id }, { assignedTo: null }] };
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ message: "You do not have permission to access support tickets" });
    }

    if (status) filter.status = status;

    const tickets = await SupportTicketModel.find(filter)
      .populate("customer", "name email")
      .populate("assignedTo", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ tickets });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch tickets", error: err.message });
  }
});

// GET /api/support/:id
router.get("/:id", verifyToken, validateRequest(ticketIdParamsSchema, "params"), async (req, res) => {
  try {
    const ticket = await SupportTicketModel.findById(req.params.id)
      .populate("customer", "name email")
      .populate("assignedTo", "name")
      .populate("messages.sender", "name role");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const isOwner = ticket.customer._id.toString() === req.user._id.toString();
    const isAssignedOrUnassigned = !ticket.assignedTo || ticket.assignedTo._id.toString() === req.user._id.toString();
    if (req.user.role === "customer" && !isOwner) {
      return res.status(403).json({ message: "This is not your ticket" });
    }
    if (req.user.role === "support" && !isAssignedOrUnassigned) {
      return res.status(403).json({ message: "This ticket is assigned to another agent" });
    }
    if (!["customer", "support", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to access support tickets" });
    }

    res.status(200).json({ ticket });
  } catch (err) {
    res.status(500).json({ message: "Could not fetch ticket", error: err.message });
  }
});

// POST /api/support/:id/messages — customer or support/admin can reply
router.post("/:id/messages", verifyToken, validateRequest(ticketIdParamsSchema, "params"), validateRequest(ticketMessageSchema), async (req, res) => {
  try {
    const { text } = req.body;
    const ticket = await SupportTicketModel.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const isOwner = ticket.customer.toString() === req.user._id.toString();
    const isAssignedOrUnassigned = !ticket.assignedTo || ticket.assignedTo.toString() === req.user._id.toString();
    if (req.user.role === "customer" && !isOwner) {
      return res.status(403).json({ message: "This is not your ticket" });
    }
    if (req.user.role === "support" && !isAssignedOrUnassigned) {
      return res.status(403).json({ message: "This ticket is assigned to another agent" });
    }
    if (!["customer", "support", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to access support tickets" });
    }

    ticket.messages.push({ sender: req.user._id, text });

    // if a support agent replies to an open ticket, auto-move it to in_progress
    if (["support", "admin"].includes(req.user.role) && ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await ticket.save();
    res.status(200).json({ message: "Message added", ticket });
  } catch (err) {
    res.status(500).json({ message: "Could not add message", error: err.message });
  }
});

// PATCH /api/support/:id/assign — [admin] assign to a support agent
router.patch("/:id/assign", verifyToken, verifyRole("admin"), validateRequest(ticketIdParamsSchema, "params"), validateRequest(assignTicketSchema), async (req, res) => {
  try {
    const { supportAgentId } = req.body;

    const agent = await UserModel.findOne({ _id: supportAgentId, role: "support", isActive: true });
    if (!agent) return res.status(400).json({ message: "An active support agent is required" });

    const ticket = await SupportTicketModel.findByIdAndUpdate(
      req.params.id,
      { assignedTo: supportAgentId, status: "in_progress" },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.status(200).json({ message: "Ticket assigned", ticket });
  } catch (err) {
    res.status(500).json({ message: "Could not assign ticket", error: err.message });
  }
});

// PATCH /api/support/:id/status — [support/admin] update status
router.patch("/:id/status", verifyToken, verifyRole("support", "admin"), validateRequest(ticketIdParamsSchema, "params"), validateRequest(ticketStatusSchema), async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await SupportTicketModel.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (req.user.role === "support" && ticket.assignedTo && ticket.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "This ticket is assigned to another agent" });
    }
    ticket.status = status;
    await ticket.save();

    res.status(200).json({ message: `Ticket status set to ${status}`, ticket });
  } catch (err) {
    res.status(500).json({ message: "Could not update ticket status", error: err.message });
  }
});

export default router;
