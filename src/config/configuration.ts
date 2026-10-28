/**
 * Đọc tất cả biến môi trường vào 1 object typed.
 * KHÔNG hardcode bất kỳ tham số CAT nào tại đây — mọi giá trị đọc từ .env.
 * SRS CLAUDE.md: "không hardcode giá trị có khả năng đổi"
 */
export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:3000'],
  reviewEnabled: process.env.REVIEW_ENABLED !== 'false',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    ttlSeconds: parseInt(process.env.REDIS_TTL_SECONDS ?? '7200', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  /**
   * Tham số CAT Engine — SRS Mục 4.2–4.5, CLAUDE.md
   * Các giá trị này sẽ được cập nhật sau khi có calibration data thật (Tuần 9-10)
   */
  cat: {
    thetaInit: parseFloat(process.env.CAT_THETA_INIT ?? '-0.5'),      // θ₀ — chỉ ảnh hưởng câu đầu tiên
    priorMean: parseFloat(process.env.CAT_PRIOR_MEAN ?? '0.0'),       // Prior N(μ,σ²) cho EAP
    priorVariance: parseFloat(process.env.CAT_PRIOR_VARIANCE ?? '1.0'),
    quadraturePoints: parseInt(process.env.CAT_QUADRATURE_POINTS ?? '41', 10), // [-4,+4], bước 0.2
    maxItems: parseInt(process.env.CAT_MAX_ITEMS ?? '25', 10),
    seThreshold: parseFloat(process.env.CAT_SE_THRESHOLD ?? '0.35'),  // điều kiện dừng SE < 0.35
    // Outlier Early Stop (ngưỡng năng lực θ sau >= 8 câu, SRS Mục 4.5)
    outlierThetaMin: parseFloat(process.env.CAT_OUTLIER_THETA_MIN ?? process.env.CAT_BOUNDARY_BMIN ?? '-2.5'),
    outlierThetaMax: parseFloat(process.env.CAT_OUTLIER_THETA_MAX ?? process.env.CAT_BOUNDARY_BMAX ?? '1.5'),
    outlierMinItems: parseInt(process.env.CAT_OUTLIER_MIN_ITEMS ?? process.env.CAT_BOUNDARY_MIN_ITEMS ?? '8', 10),
    // Giữ tương thích ngược với cấu hình cũ
    boundaryBMin: parseFloat(process.env.CAT_OUTLIER_THETA_MIN ?? process.env.CAT_BOUNDARY_BMIN ?? '-2.5'),
    boundaryBMax: parseFloat(process.env.CAT_OUTLIER_THETA_MAX ?? process.env.CAT_BOUNDARY_BMAX ?? '1.5'),
    boundaryMinItems: parseInt(process.env.CAT_OUTLIER_MIN_ITEMS ?? process.env.CAT_BOUNDARY_MIN_ITEMS ?? '8', 10),
    // Khoảng độ khó b hợp lệ của Item Bank (DC-34)
    itemBMin: parseFloat(process.env.CAT_ITEM_B_MIN ?? '-4.0'),
    itemBMax: parseFloat(process.env.CAT_ITEM_B_MAX ?? '4.0'),
    sessionGraceSeconds: parseInt(process.env.CAT_SESSION_GRACE_SECONDS ?? '60', 10),
    topNItems: parseInt(process.env.CAT_TOP_N_ITEMS ?? '5', 10),       // Randomized Top-N b-matching
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
  },

  eduz: {
    apiKey: process.env.EDUZ_API_KEY, // M2M API Key — không phải JWT
  },


});

export type AppConfig = ReturnType<typeof configuration>;
