-- Run as a controlled PostgreSQL administrator. These NOLOGIN group roles contain no credentials.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apaar_migrator') THEN
    CREATE ROLE apaar_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apaar_runtime') THEN
    CREATE ROLE apaar_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE apaar TO apaar_migrator, apaar_runtime;
GRANT USAGE ON SCHEMA public TO apaar_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apaar_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apaar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE apaar_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apaar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE apaar_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO apaar_runtime;
