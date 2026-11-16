export const validateRequest = (schema, target = "body") => (req, res, next) => {
  const result = schema.safeParse(req[target]);
  if (!result.success) {
    return res.status(400).json({
      message: "Invalid request data",
      issues: result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
  }
  req[target] = result.data;
  next();
};
