import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RAZORPAY_KEY_ID: z.string().optional().default('rzp_test_placeholder_key_id'),
  RAZORPAY_KEY_SECRET: z.string().optional().default('placeholder_key_secret'),
});

export const config = envSchema.parse(process.env);
