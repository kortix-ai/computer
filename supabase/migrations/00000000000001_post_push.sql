-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Post-Push Migration                                                       ║
-- ║                                                                             ║
-- ║  Runs AFTER `drizzle-kit push` creates tables. Sets up:                    ║
-- ║    - Table-level grants (SELECT/INSERT/UPDATE for Supabase roles)          ║
-- ║    - Atomic credit functions (used by billing via Supabase RPC)            ║
-- ║                                                                             ║
-- ║  All functions live in `public` schema so Supabase RPC can find them,      ║
-- ║  but they reference tables in the `kortix` schema.                         ║
-- ║                                                                             ║
-- ║  No RLS — access control is handled at the API layer.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ─── Table Grants ──────────────────────────────────────────────────────────
-- Grant access to all current and future tables in the kortix schema.
-- This is idempotent (re-running is safe).
ALTER DEFAULT PRIVILEGES IN SCHEMA kortix GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA kortix GRANT SELECT, INSERT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA kortix GRANT SELECT ON TABLES TO anon;

-- Grant on existing tables (ALTER DEFAULT PRIVILEGES only affects future tables)
GRANT ALL ON ALL TABLES IN SCHEMA kortix TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA kortix TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA kortix TO anon;


-- ─── Atomic Credit Functions ───────────────────────────────────────────────
-- These live in `public` schema so Supabase .rpc('atomic_*') can find them.
-- They use `SET search_path TO ''` + fully qualified kortix.* references
-- so they are safe from search_path injection.

-- ── atomic_use_credits ─────────────────────────────────────────────────────
-- Deducts credits from an account. Priority: daily → monthly → extra.
-- Logs the transaction in kortix.credit_ledger.
CREATE OR REPLACE FUNCTION public.atomic_use_credits(
    p_account_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT 'Credit usage',
    p_thread_id TEXT DEFAULT NULL,
    p_message_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_daily_balance NUMERIC(10, 2);
    v_expiring_balance NUMERIC(10, 2);
    v_non_expiring_balance NUMERIC(10, 2);
    v_total_balance NUMERIC(10, 2);
    v_amount_from_daily NUMERIC(10, 2) := 0;
    v_amount_from_expiring NUMERIC(10, 2) := 0;
    v_amount_from_non_expiring NUMERIC(10, 2) := 0;
    v_remaining NUMERIC(10, 2);
    v_new_daily NUMERIC(10, 2);
    v_new_expiring NUMERIC(10, 2);
    v_new_non_expiring NUMERIC(10, 2);
    v_new_total NUMERIC(10, 2);
    v_transaction_id UUID;
BEGIN
    SELECT
        COALESCE(daily_credits_balance, 0),
        COALESCE(expiring_credits, 0),
        COALESCE(non_expiring_credits, 0),
        COALESCE(balance, 0)
    INTO
        v_daily_balance, v_expiring_balance, v_non_expiring_balance, v_total_balance
    FROM kortix.credit_accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No credit account found',
            'required', p_amount,
            'available', 0
        );
    END IF;

    v_remaining := p_amount;

    -- Step 1: Deduct from DAILY credits first
    IF v_remaining > 0 AND v_daily_balance > 0 THEN
        IF v_daily_balance >= v_remaining THEN
            v_amount_from_daily := v_remaining;
            v_remaining := 0;
        ELSE
            v_amount_from_daily := v_daily_balance;
            v_remaining := v_remaining - v_daily_balance;
        END IF;
    END IF;

    -- Step 2: Deduct from MONTHLY (expiring) credits second
    IF v_remaining > 0 AND v_expiring_balance > 0 THEN
        IF v_expiring_balance >= v_remaining THEN
            v_amount_from_expiring := v_remaining;
            v_remaining := 0;
        ELSE
            v_amount_from_expiring := v_expiring_balance;
            v_remaining := v_remaining - v_expiring_balance;
        END IF;
    END IF;

    -- Step 3: Deduct from EXTRA (non-expiring) credits last
    IF v_remaining > 0 THEN
        v_amount_from_non_expiring := v_remaining;
        v_remaining := 0;
    END IF;

    v_new_daily := v_daily_balance - v_amount_from_daily;
    v_new_expiring := v_expiring_balance - v_amount_from_expiring;
    v_new_non_expiring := v_non_expiring_balance - v_amount_from_non_expiring;
    v_new_total := v_new_daily + v_new_expiring + v_new_non_expiring;

    UPDATE kortix.credit_accounts
    SET
        daily_credits_balance = v_new_daily,
        expiring_credits = v_new_expiring,
        non_expiring_credits = v_new_non_expiring,
        balance = v_new_total,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    INSERT INTO kortix.credit_ledger (
        account_id, amount, balance_after, type, description, metadata
    ) VALUES (
        p_account_id, -p_amount, v_new_total, 'usage', p_description,
        jsonb_build_object(
            'from_daily', v_amount_from_daily,
            'from_monthly', v_amount_from_expiring,
            'from_extra', v_amount_from_non_expiring,
            'thread_id', p_thread_id,
            'message_id', p_message_id
        )
    ) RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'amount_deducted', p_amount,
        'new_total', v_new_total,
        'new_daily', v_new_daily,
        'new_expiring', v_new_expiring,
        'new_non_expiring', v_new_non_expiring,
        'from_daily', v_amount_from_daily,
        'from_monthly', v_amount_from_expiring,
        'from_extra', v_amount_from_non_expiring,
        'from_expiring', v_amount_from_expiring,
        'from_non_expiring', v_amount_from_non_expiring,
        'transaction_id', v_transaction_id
    );
END;
$function$;


-- ── atomic_add_credits ─────────────────────────────────────────────────────
-- Adds credits to an account. Supports idempotency via stripe_event_id
-- or idempotency_key. Creates the credit_accounts row if it doesn't exist.
CREATE OR REPLACE FUNCTION public.atomic_add_credits(
    p_account_id UUID,
    p_amount NUMERIC,
    p_is_expiring BOOLEAN DEFAULT TRUE,
    p_description TEXT DEFAULT 'Credit added',
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_stripe_event_id TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_current_expiring NUMERIC(10, 2);
    v_current_non_expiring NUMERIC(10, 2);
    v_current_balance NUMERIC(10, 2);
    v_new_expiring NUMERIC(10, 2);
    v_new_non_expiring NUMERIC(10, 2);
    v_new_total NUMERIC(10, 2);
    v_tier TEXT;
    v_ledger_id UUID;
BEGIN
    -- Idempotency: check stripe_event_id
    IF p_stripe_event_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM kortix.credit_ledger
            WHERE stripe_event_id = p_stripe_event_id
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Credit already added (duplicate prevented)',
                'duplicate_prevented', true
            );
        END IF;
    END IF;

    -- Idempotency: check idempotency_key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM kortix.credit_ledger
            WHERE idempotency_key = p_idempotency_key
            AND created_at > NOW() - INTERVAL '1 hour'
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Credit already added (idempotent)',
                'duplicate_prevented', true
            );
        END IF;
    END IF;

    SELECT expiring_credits, non_expiring_credits, balance, tier
    INTO v_current_expiring, v_current_non_expiring, v_current_balance, v_tier
    FROM kortix.credit_accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_current_expiring := 0;
        v_current_non_expiring := 0;
        v_current_balance := 0;
        v_tier := 'none';

        INSERT INTO kortix.credit_accounts (
            account_id, expiring_credits, non_expiring_credits, balance, tier
        ) VALUES (
            p_account_id, 0, 0, 0, v_tier
        );
    END IF;

    IF p_is_expiring THEN
        v_new_expiring := v_current_expiring + p_amount;
        v_new_non_expiring := v_current_non_expiring;
    ELSE
        v_new_expiring := v_current_expiring;
        v_new_non_expiring := v_current_non_expiring + p_amount;
    END IF;

    v_new_total := v_new_expiring + v_new_non_expiring;

    UPDATE kortix.credit_accounts
    SET
        expiring_credits = v_new_expiring,
        non_expiring_credits = v_new_non_expiring,
        balance = v_new_total,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    INSERT INTO kortix.credit_ledger (
        account_id, amount, balance_after, type, description,
        is_expiring, expires_at, stripe_event_id, idempotency_key, processing_source
    ) VALUES (
        p_account_id, p_amount, v_new_total,
        COALESCE(p_type, CASE WHEN p_is_expiring THEN 'tier_grant' ELSE 'purchase' END),
        p_description, p_is_expiring, p_expires_at,
        p_stripe_event_id, p_idempotency_key, 'atomic_function'
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'expiring_credits', v_new_expiring,
        'non_expiring_credits', v_new_non_expiring,
        'total_balance', v_new_total,
        'ledger_id', v_ledger_id
    );
END;
$function$;


-- ── atomic_reset_expiring_credits ──────────────────────────────────────────
-- Resets expiring (monthly) credits to a new amount, preserving non-expiring.
-- Used during monthly renewal.
CREATE OR REPLACE FUNCTION public.atomic_reset_expiring_credits(
    p_account_id UUID,
    p_new_credits NUMERIC,
    p_description TEXT DEFAULT 'Monthly credit renewal',
    p_stripe_event_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_current_balance NUMERIC(10, 2);
    v_current_expiring NUMERIC(10, 2);
    v_current_non_expiring NUMERIC(10, 2);
    v_actual_non_expiring NUMERIC(10, 2);
    v_new_total NUMERIC(10, 2);
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT balance, expiring_credits, non_expiring_credits
    INTO v_current_balance, v_current_expiring, v_current_non_expiring
    FROM kortix.credit_accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account not found');
    END IF;

    IF v_current_balance <= v_current_non_expiring THEN
        v_actual_non_expiring := v_current_balance;
    ELSE
        v_actual_non_expiring := v_current_non_expiring;
    END IF;

    v_new_total := p_new_credits + v_actual_non_expiring;
    v_expires_at := DATE_TRUNC('month', NOW() + INTERVAL '1 month') + INTERVAL '1 month';

    UPDATE kortix.credit_accounts
    SET
        expiring_credits = p_new_credits,
        non_expiring_credits = v_actual_non_expiring,
        balance = v_new_total,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    INSERT INTO kortix.credit_ledger (
        account_id, amount, balance_after, type, description,
        is_expiring, expires_at, stripe_event_id, metadata, processing_source
    ) VALUES (
        p_account_id, p_new_credits, v_new_total, 'tier_grant', p_description,
        true, v_expires_at, p_stripe_event_id,
        jsonb_build_object(
            'renewal', true,
            'non_expiring_preserved', v_actual_non_expiring,
            'previous_balance', v_current_balance
        ),
        'atomic_function'
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_expiring', p_new_credits,
        'non_expiring', v_actual_non_expiring,
        'total_balance', v_new_total
    );
END;
$function$;


-- ── atomic_grant_renewal_credits (Stripe) ──────────────────────────────────
-- Grants monthly renewal credits with idempotency via renewal_processing table.
-- Used by the Stripe webhook handler and yearly rotation job.
CREATE OR REPLACE FUNCTION public.atomic_grant_renewal_credits(
    p_account_id UUID,
    p_period_start BIGINT,
    p_period_end BIGINT,
    p_credits NUMERIC,
    p_processed_by TEXT,
    p_invoice_id TEXT DEFAULT NULL,
    p_stripe_event_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_already_processed BOOLEAN;
    v_existing_processor TEXT;
    v_current_non_expiring NUMERIC(10, 2);
    v_new_total NUMERIC(10, 2);
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.renewal_processing
        WHERE account_id = p_account_id AND period_start = p_period_start
    ), (
        SELECT processed_by FROM public.renewal_processing
        WHERE account_id = p_account_id AND period_start = p_period_start
        LIMIT 1
    ) INTO v_already_processed, v_existing_processor;

    IF v_already_processed THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'already_processed',
            'processed_by', v_existing_processor,
            'duplicate_prevented', true
        );
    END IF;

    INSERT INTO public.renewal_processing (
        account_id, period_start, period_end, subscription_id,
        processed_by, credits_granted, stripe_event_id
    )
    SELECT p_account_id, p_period_start, p_period_end, stripe_subscription_id,
           p_processed_by, p_credits, p_stripe_event_id
    FROM kortix.credit_accounts
    WHERE account_id = p_account_id;

    SELECT non_expiring_credits INTO v_current_non_expiring
    FROM kortix.credit_accounts WHERE account_id = p_account_id;

    v_current_non_expiring := COALESCE(v_current_non_expiring, 0);
    v_new_total := p_credits + v_current_non_expiring;
    v_expires_at := TO_TIMESTAMP(p_period_end);

    UPDATE kortix.credit_accounts
    SET
        expiring_credits = p_credits,
        balance = v_new_total,
        last_grant_date = TO_TIMESTAMP(p_period_start),
        next_credit_grant = TO_TIMESTAMP(p_period_end),
        last_processed_invoice_id = COALESCE(p_invoice_id, last_processed_invoice_id),
        last_renewal_period_start = p_period_start,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    INSERT INTO kortix.credit_ledger (
        account_id, amount, balance_after, type, description,
        is_expiring, expires_at, stripe_event_id, processing_source
    ) VALUES (
        p_account_id, p_credits, v_new_total, 'tier_grant',
        'Monthly renewal: ' || p_processed_by,
        true, v_expires_at, p_stripe_event_id, p_processed_by
    );

    RETURN jsonb_build_object(
        'success', true,
        'credits_granted', p_credits,
        'new_balance', v_new_total,
        'expiring_credits', p_credits,
        'non_expiring_credits', v_current_non_expiring,
        'processed_by', p_processed_by
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'reason', 'error',
        'error', SQLERRM
    );
END;
$function$;


-- ── atomic_daily_credit_refresh ────────────────────────────────────────────
-- Resets daily credits balance to the configured amount.
-- Idempotent via daily_refresh_tracking table.
CREATE OR REPLACE FUNCTION public.atomic_daily_credit_refresh(
    p_account_id UUID,
    p_credit_amount NUMERIC,
    p_tier TEXT,
    p_processed_by TEXT,
    p_refresh_interval_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'kortix', 'public'
AS $function$
DECLARE
    v_last_refresh TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
    v_refresh_date DATE := v_now::DATE;
    v_already_refreshed BOOLEAN;
    v_interval INTERVAL;
    v_should_refresh BOOLEAN := FALSE;
    v_old_daily NUMERIC(10, 2);
    v_old_total NUMERIC(10, 2);
    v_new_daily NUMERIC(10, 2);
    v_new_total NUMERIC(10, 2);
    v_tracking_id UUID;
    v_credits_added NUMERIC(10, 2);
BEGIN
    v_interval := (p_refresh_interval_hours || ' hours')::INTERVAL;

    SELECT last_daily_refresh, daily_credits_balance, balance
    INTO v_last_refresh, v_old_daily, v_old_total
    FROM kortix.credit_accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'account_not_found',
            'duplicate_prevented', false
        );
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.daily_refresh_tracking
        WHERE account_id = p_account_id AND refresh_date = v_refresh_date
    ) INTO v_already_refreshed;

    IF v_already_refreshed THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'already_refreshed_today',
            'duplicate_prevented', true,
            'refresh_date', v_refresh_date
        );
    END IF;

    IF v_last_refresh IS NULL THEN
        v_should_refresh := TRUE;
    ELSIF v_now - v_last_refresh > v_interval THEN
        v_should_refresh := TRUE;
    END IF;

    IF NOT v_should_refresh THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'interval_not_elapsed',
            'duplicate_prevented', false,
            'last_refresh', v_last_refresh,
            'next_refresh', v_last_refresh + v_interval
        );
    END IF;

    INSERT INTO public.daily_refresh_tracking (
        account_id, refresh_date, credits_granted, tier, processed_by
    ) VALUES (
        p_account_id, v_refresh_date, p_credit_amount, p_tier, p_processed_by
    )
    ON CONFLICT (account_id, refresh_date) DO NOTHING
    RETURNING id INTO v_tracking_id;

    IF v_tracking_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'concurrent_refresh_prevented',
            'duplicate_prevented', true,
            'refresh_date', v_refresh_date
        );
    END IF;

    v_new_daily := p_credit_amount;
    v_credits_added := p_credit_amount - COALESCE(v_old_daily, 0);
    v_new_total := v_old_total + v_credits_added;

    UPDATE kortix.credit_accounts
    SET
        daily_credits_balance = v_new_daily,
        balance = v_new_total,
        last_daily_refresh = v_now,
        updated_at = v_now
    WHERE account_id = p_account_id;

    INSERT INTO kortix.credit_ledger (
        account_id, amount, balance_after, type, description,
        is_expiring, expires_at, metadata
    ) VALUES (
        p_account_id, v_credits_added, v_new_total, 'daily_refresh',
        format('Daily credits refresh: %s -> %s', COALESCE(v_old_daily, 0), v_new_daily),
        TRUE, v_now + v_interval,
        jsonb_build_object(
            'tier', p_tier,
            'refresh_date', v_refresh_date,
            'old_daily', v_old_daily,
            'new_daily', v_new_daily,
            'refresh_interval_hours', p_refresh_interval_hours,
            'tracking_id', v_tracking_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'credits_granted', v_credits_added,
        'new_daily_balance', v_new_daily,
        'new_total_balance', v_new_total,
        'refresh_date', v_refresh_date,
        'old_daily', v_old_daily,
        'duplicate_prevented', false,
        'tracking_id', v_tracking_id
    );
END;
$function$;
