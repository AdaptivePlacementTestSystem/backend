-- T2 duplicate checks call similarity(); make the required extension available
-- on freshly provisioned databases as well as existing environments.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
