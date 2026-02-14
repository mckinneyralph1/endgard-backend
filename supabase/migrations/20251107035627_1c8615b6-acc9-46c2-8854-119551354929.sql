-- Enable realtime for report_sections table
ALTER TABLE report_sections REPLICA IDENTITY FULL;

-- Add the table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE report_sections;