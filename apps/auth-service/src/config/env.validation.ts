import Joi from "joi";

export const envValidationSchema = Joi.object({
    PORT: Joi.number().required(),
    DATABASE_URL: Joi.string().uri().required(),
    NODE_ENV: Joi.string().valid('development','production').required(),
});