-- Chat, spreadsheet, and document essentials kinds
alter type public.project_asset_kind add value if not exists 'chat';
alter type public.project_asset_kind add value if not exists 'spreadsheet';
alter type public.project_asset_kind add value if not exists 'document';
