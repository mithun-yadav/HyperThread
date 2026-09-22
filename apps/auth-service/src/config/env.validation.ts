import Joi from "joi";

export const envValidationSchema = Joi.object({
    PORT: Joi.number().required(),
    DATABASE_URL: Joi.string().uri().required(),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    FRONTEND_URL: Joi.string().uri().required(),
    JWT_ACCESS_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_SECRET:Joi.string().min(32).required(),
});
