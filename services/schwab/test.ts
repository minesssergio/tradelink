import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadSchwabConfig } from './src/config/schwab.config.js';
import { fetchWithAuth } from './src/lib/schwabApi.js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

(async () => {
  const config = loadSchwabConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const { data } = await supabase.from('schwab_tokens').select('user_id').eq('status', 'ACTIVE').limit(1);
  const userId = data![0].user_id;
  const res = await fetchWithAuth(supabase, userId, config, '/accounts/accountNumbers');
  fs.writeFileSync('account_numbers_dump.json', JSON.stringify(res, null, 2));
  console.log('Dumped to account_numbers_dump.json');
})();
