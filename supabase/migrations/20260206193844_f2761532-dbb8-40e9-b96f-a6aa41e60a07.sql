
-- API Keys table for external API access
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "sk_live_a1b2")
  key_hash TEXT NOT NULL, -- SHA-256 hash of the full key
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_hour INT NOT NULL DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE POLICY "Users can create their own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE POLICY "Users can delete their own API keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);

-- API Usage Logs for rate limiting and analytics
CREATE TABLE public.api_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  response_time_ms INT,
  ip_address TEXT,
  user_agent TEXT,
  request_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API key owners can view their usage logs"
  ON public.api_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.api_keys ak
      WHERE ak.id = api_usage_logs.api_key_id
        AND (ak.user_id = auth.uid() OR public.user_is_super_admin(auth.uid()))
    )
  );

CREATE POLICY "System can insert usage logs"
  ON public.api_usage_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_api_usage_logs_api_key_id ON public.api_usage_logs(api_key_id);
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);

-- Webhook Subscriptions
CREATE TABLE public.webhook_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  project_filter TEXT, -- NULL means all projects
  failure_count INT NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook subscriptions"
  ON public.webhook_subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE POLICY "Users can create their own webhook subscriptions"
  ON public.webhook_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own webhook subscriptions"
  ON public.webhook_subscriptions FOR UPDATE
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE POLICY "Users can delete their own webhook subscriptions"
  ON public.webhook_subscriptions FOR DELETE
  USING (auth.uid() = user_id OR public.user_is_super_admin(auth.uid()));

CREATE INDEX idx_webhook_subscriptions_user_id ON public.webhook_subscriptions(user_id);

-- Webhook Delivery Logs
CREATE TABLE public.webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  response_time_ms INT,
  attempt_number INT NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their webhook deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webhook_subscriptions ws
      WHERE ws.id = webhook_deliveries.subscription_id
        AND (ws.user_id = auth.uid() OR public.user_is_super_admin(auth.uid()))
    )
  );

CREATE POLICY "System can insert webhook deliveries"
  ON public.webhook_deliveries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_webhook_deliveries_subscription_id ON public.webhook_deliveries(subscription_id);
CREATE INDEX idx_webhook_deliveries_delivered_at ON public.webhook_deliveries(delivered_at DESC);

-- Triggers for updated_at
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_subscriptions_updated_at
  BEFORE UPDATE ON public.webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
