-- Stop blocking removed emails. Restore every soft-deleted account so
-- Google sign-in and register work again for those addresses.

UPDATE users
SET deleted_at = NULL,
    status = 'active',
    updated_at = NOW()
WHERE deleted_at IS NOT NULL;
