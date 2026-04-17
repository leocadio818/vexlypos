"""
Supabase multi-tenancy helpers.
Provides client_id filtering for all Supabase queries.
"""
import os


def get_client_id():
    """Returns SUPABASE_CLIENT_ID from env, or None if not configured."""
    return os.environ.get("SUPABASE_CLIENT_ID") or None


def sb_select(table_query, client_id=None):
    """Add client_id filter to a SELECT query if configured."""
    cid = client_id or get_client_id()
    if cid:
        return table_query.eq("client_id", cid)
    return table_query


def sb_insert(data: dict, client_id=None):
    """Add client_id to an INSERT data dict if configured."""
    cid = client_id or get_client_id()
    if cid:
        data["client_id"] = cid
    return data


def sb_update_filter(table_query, client_id=None):
    """Add client_id filter to an UPDATE/DELETE query if configured."""
    cid = client_id or get_client_id()
    if cid:
        return table_query.eq("client_id", cid)
    return table_query
