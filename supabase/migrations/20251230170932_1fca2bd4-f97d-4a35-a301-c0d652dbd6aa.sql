-- Add recurring event support to calendar_events
ALTER TABLE calendar_events ADD COLUMN recurrence_rule TEXT;
ALTER TABLE calendar_events ADD COLUMN recurrence_end DATE;
ALTER TABLE calendar_events ADD COLUMN parent_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE;
ALTER TABLE calendar_events ADD COLUMN exception_dates TIMESTAMPTZ[] DEFAULT '{}';
ALTER TABLE calendar_events ADD COLUMN is_recurring BOOLEAN DEFAULT false;

-- Index for efficient recurring event queries
CREATE INDEX idx_calendar_events_recurring ON calendar_events(is_recurring) WHERE is_recurring = true;
CREATE INDEX idx_calendar_events_parent ON calendar_events(parent_event_id) WHERE parent_event_id IS NOT NULL;