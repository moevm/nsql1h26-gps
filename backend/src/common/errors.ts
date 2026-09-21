import { ValidationError } from "elysia";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const errorHandler = ({ code, error, set }: { code: string; error: Error; set: { status: number | string } }) => {
  if (error instanceof AppError) {
    set.status = error.status;
    return { error: error.code, message: error.message };
  }
  if (error instanceof ValidationError) {
    set.status = 422;
    return { error: "VALIDATION", message: error.message };
  }
  if ((error as { code?: string })?.code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
    set.status = 409;
    return { error: "CONFLICT", message: "constraint violation" };
  }
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { error: "NOT_FOUND", message: "not found" };
  }
  set.status = 500;
  console.error("[unhandled]", code, error);
  return { error: "INTERNAL", message: "internal error" };
};
