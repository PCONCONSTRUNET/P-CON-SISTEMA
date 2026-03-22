-- Remove old foreign key constraints
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_client_id_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_client_id_fkey;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_client_id_fkey;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_client_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_client_id_fkey;
ALTER TABLE client_users DROP CONSTRAINT IF EXISTS client_users_client_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE payments 
ADD CONSTRAINT payments_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE subscriptions 
ADD CONSTRAINT subscriptions_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE contracts 
ADD CONSTRAINT contracts_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE invoices 
ADD CONSTRAINT invoices_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE notifications 
ADD CONSTRAINT notifications_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE client_users 
ADD CONSTRAINT client_users_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;