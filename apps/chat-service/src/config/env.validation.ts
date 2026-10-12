import Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().required(),
  DATABASE_URL: Joi.string().uri().required(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  REDIS_URL: Joi.string().uri().required(),
  INTERNAL_API_KEY: Joi.string().min(32).required(),
  AUTH_SERVICE_URL: Joi.string().uri().required(),
});
