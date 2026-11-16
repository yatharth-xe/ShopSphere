import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  category: z.enum(["order_issue", "refund", "product_question", "account", "general"]).optional(),
  relatedOrder: objectId.optional(),
  relatedReturn: objectId.optional(),
  message: z.string().trim().min(1).max(5000),
}).strict();

export const ticketMessageSchema = z.object({ text: z.string().trim().min(1).max(5000) }).strict();
export const assignTicketSchema = z.object({ supportAgentId: objectId }).strict();
export const ticketStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
}).strict();
export const ticketIdParamsSchema = z.object({ id: objectId });
