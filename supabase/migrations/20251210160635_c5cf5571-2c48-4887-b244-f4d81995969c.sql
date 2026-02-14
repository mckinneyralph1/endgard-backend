-- Create table for agent conversations
CREATE TABLE public.agent_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for agent messages
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tools_used JSONB,
  navigation_action JSONB,
  proactive_suggestions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations - users can only access their own
CREATE POLICY "Users can view their own conversations"
ON public.agent_conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.agent_conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.agent_conversations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.agent_conversations FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for messages - users can only access messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON public.agent_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.agent_conversations 
  WHERE id = agent_messages.conversation_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can create messages in their conversations"
ON public.agent_messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.agent_conversations 
  WHERE id = agent_messages.conversation_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can delete messages in their conversations"
ON public.agent_messages FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.agent_conversations 
  WHERE id = agent_messages.conversation_id 
  AND user_id = auth.uid()
));

-- Indexes for performance
CREATE INDEX idx_agent_conversations_user_id ON public.agent_conversations(user_id);
CREATE INDEX idx_agent_messages_conversation_id ON public.agent_messages(conversation_id);
CREATE INDEX idx_agent_messages_created_at ON public.agent_messages(created_at);

-- Trigger to update updated_at
CREATE TRIGGER update_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();