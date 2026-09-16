-- Baseline skema `public` BarberFlow, di-dump dari database produksi pada 2026-09-17
-- (npx supabase db dump --schema public). Hanya struktur, tanpa data.
--
-- JANGAN dijalankan ke database produksi: skema ini sudah ada di sana.
-- Kegunaan: membuat project Supabase dev dari nol. Langkahnya ada di
-- CONTRIBUTING.md bagian "Menyiapkan Project Supabase Dev".
--
-- Tidak termasuk: baris awal business_hours (jalankan
-- INSERT INTO public.business_hours DEFAULT VALUES; sesudah file ini)
-- dan skema bawaan Supabase (auth, storage, realtime).

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."payment_status" AS ENUM (
    'unpaid',
    'paid',
    'expired',
    'failed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."queue_status" AS ENUM (
    'confirmed',
    'estimated',
    'pending_reply',
    'completed'
);


ALTER TYPE "public"."queue_status" OWNER TO "postgres";


CREATE TYPE "public"."request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."barber_time_off" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barber_id" "uuid" NOT NULL,
    "off_date" "date" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."barber_time_off" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "specialization" "text",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    CONSTRAINT "barbers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'break'::"text", 'off'::"text"])))
);


ALTER TABLE "public"."barbers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" integer DEFAULT 1 NOT NULL,
    "open_hour" integer DEFAULT 9 NOT NULL,
    "close_hour" integer DEFAULT 20 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shop_name" "text" DEFAULT 'BarberFlow'::"text" NOT NULL,
    "logo_url" "text",
    CONSTRAINT "single_row_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."business_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_name" "text" NOT NULL,
    "phone" "text",
    "status" "public"."queue_status" DEFAULT 'estimated'::"public"."queue_status" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "scheduled_time" time without time zone,
    "barber_id" "uuid",
    "service_id" "uuid" NOT NULL,
    "source_request_id" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text",
    "payment_xendit_qr_id" "text",
    "payment_qr_amount" numeric
);


ALTER TABLE "public"."queue_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric NOT NULL,
    "duration_minutes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_name" "text",
    "sender_phone" "text" NOT NULL,
    "raw_message" "text" NOT NULL,
    "extracted_day" "text",
    "extracted_time" "text",
    "extracted_service" "text",
    "is_booking_intent" boolean DEFAULT false NOT NULL,
    "was_edited_by_barber" boolean DEFAULT false NOT NULL,
    "status" "public"."request_status" DEFAULT 'pending'::"public"."request_status" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status_notified" boolean DEFAULT false NOT NULL,
    "sender_wa_id" "text",
    "payment_status" "public"."payment_status" DEFAULT 'unpaid'::"public"."payment_status" NOT NULL,
    "dp_amount" numeric,
    "xendit_reference_id" "text",
    "xendit_qr_id" "text",
    "payment_expires_at" timestamp with time zone,
    "dp_paid_at" timestamp with time zone,
    "payment_notified" boolean DEFAULT false NOT NULL,
    "scheduled_date" "date"
);


ALTER TABLE "public"."whatsapp_requests" OWNER TO "postgres";


ALTER TABLE ONLY "public"."barber_time_off"
    ADD CONSTRAINT "barber_time_off_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barbers"
    ADD CONSTRAINT "barbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue_entries"
    ADD CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barber_time_off"
    ADD CONSTRAINT "unique_barber_date" UNIQUE ("barber_id", "off_date");



ALTER TABLE ONLY "public"."whatsapp_requests"
    ADD CONSTRAINT "whatsapp_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_queue_barber_date" ON "public"."queue_entries" USING "btree" ("barber_id", "scheduled_date");



CREATE UNIQUE INDEX "one_active_serving_per_barber" ON "public"."queue_entries" USING "btree" ("barber_id") WHERE (("started_at" IS NOT NULL) AND ("completed_at" IS NULL));



CREATE INDEX "whatsapp_requests_payment_status_idx" ON "public"."whatsapp_requests" USING "btree" ("payment_status");



CREATE UNIQUE INDEX "whatsapp_requests_xendit_reference_id_key" ON "public"."whatsapp_requests" USING "btree" ("xendit_reference_id") WHERE ("xendit_reference_id" IS NOT NULL);



ALTER TABLE ONLY "public"."barber_time_off"
    ADD CONSTRAINT "barber_time_off_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_entries"
    ADD CONSTRAINT "queue_entries_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."queue_entries"
    ADD CONSTRAINT "queue_entries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."queue_entries"
    ADD CONSTRAINT "queue_entries_source_request_id_fkey" FOREIGN KEY ("source_request_id") REFERENCES "public"."whatsapp_requests"("id");



CREATE POLICY "anon_select_business_hours" ON "public"."business_hours" FOR SELECT TO "anon" USING (true);



CREATE POLICY "authenticated_delete_queue_entries" ON "public"."queue_entries" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated_insert_barbers" ON "public"."barbers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_insert_queue_entries" ON "public"."queue_entries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_insert_services" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_insert_whatsapp_requests" ON "public"."whatsapp_requests" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_select_barber_time_off" ON "public"."barber_time_off" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_barbers" ON "public"."barbers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_business_hours" ON "public"."business_hours" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_queue_entries" ON "public"."queue_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_services" ON "public"."services" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_whatsapp_requests" ON "public"."whatsapp_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_update_barbers" ON "public"."barbers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_business_hours" ON "public"."business_hours" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_queue_entries" ON "public"."queue_entries" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_services" ON "public"."services" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_whatsapp_requests" ON "public"."whatsapp_requests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."barber_time_off" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barbers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."queue_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_requests" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."barber_time_off" TO "anon";
GRANT ALL ON TABLE "public"."barber_time_off" TO "authenticated";
GRANT ALL ON TABLE "public"."barber_time_off" TO "service_role";



GRANT ALL ON TABLE "public"."barbers" TO "anon";
GRANT ALL ON TABLE "public"."barbers" TO "authenticated";
GRANT ALL ON TABLE "public"."barbers" TO "service_role";



GRANT ALL ON TABLE "public"."business_hours" TO "anon";
GRANT ALL ON TABLE "public"."business_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."business_hours" TO "service_role";



GRANT ALL ON TABLE "public"."queue_entries" TO "anon";
GRANT ALL ON TABLE "public"."queue_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."queue_entries" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_requests" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_requests" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Realtime: di produksi, publication supabase_realtime hanya berisi tabel ini.
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.whatsapp_requests;
