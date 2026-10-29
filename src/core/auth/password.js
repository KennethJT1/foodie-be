import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

export const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

// Compared when the account doesn't exist, so a wrong email takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

export const checkPassword = (password, hash) => bcrypt.compare(password ?? '', hash ?? DUMMY_HASH);
