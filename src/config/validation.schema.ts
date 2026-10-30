import * as Joi from 'joi';

/**
 * Validate biến môi trường bắt buộc khi khởi động ứng dụng.
 * App sẽ crash ngay nếu thiếu — tốt hơn crash ngầm khi runtime.
 */
export const validationSchema = Joi.object({
  // App
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().optional(),
  REVIEW_ENABLED: Joi.boolean().default(true),

  // Database — bắt buộc
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_TTL_SECONDS: Joi.number().default(7200),

  // JWT — bắt buộc
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // CAT params — tất cả có default, không bắt buộc
  CAT_THETA_INIT: Joi.number().default(-0.5),
  CAT_PRIOR_MEAN: Joi.number().default(0.0),
  CAT_PRIOR_VARIANCE: Joi.number().positive().default(1.0),
  CAT_QUADRATURE_POINTS: Joi.number().integer().positive().default(41),
  CAT_MAX_ITEMS: Joi.number().integer().positive().default(25),
  CAT_SE_THRESHOLD: Joi.number().positive().default(0.35),
  // Outlier Early Stop (ngưỡng θ)
  CAT_OUTLIER_THETA_MIN: Joi.number().default(-2.5),
  CAT_OUTLIER_THETA_MAX: Joi.number().default(1.5),
  CAT_OUTLIER_MIN_ITEMS: Joi.number().integer().positive().default(8),
  // Tương thích ngược
  CAT_BOUNDARY_BMIN: Joi.number().default(-2.5),
  CAT_BOUNDARY_BMAX: Joi.number().default(1.5),
  CAT_BOUNDARY_MIN_ITEMS: Joi.number().integer().positive().default(8),
  // Khoảng độ khó b hợp lệ của Item Bank (DC-34)
  CAT_ITEM_B_MIN: Joi.number().default(-4.0),
  CAT_ITEM_B_MAX: Joi.number().default(4.0),
  CAT_SESSION_GRACE_SECONDS: Joi.number().integer().positive().default(60),
  CAT_TOP_N_ITEMS: Joi.number().integer().min(1).default(5),

  // Gemini
  GEMINI_API_KEY: Joi.string().optional(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),

  // EduZ M2M
  EDUZ_API_KEY: Joi.string().optional(),

  // Multi-tenant
});
