UPDATE users AS gmail
   SET password_hash = demo.password_hash,
       updated_at = NOW()
  FROM users AS demo
 WHERE LOWER(gmail.email) = 'owussamuel18@gmail.com'
   AND gmail.password_hash IS NULL
   AND LOWER(demo.email) = 'admin@linkwavehub.com'
   AND demo.password_hash IS NOT NULL;
