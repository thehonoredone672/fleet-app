// Validates req[source] against a Zod schema. On success, req[source] is
// replaced with the parsed (and type-coerced/defaulted) value so
// downstream code can trust its shape.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  req[source] = result.data;
  next();
};

module.exports = validate;
