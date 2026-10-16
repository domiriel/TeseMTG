// Import this FIRST in every test file. The legacy code reads years in local
// time (bug B5), so differential tests pin the timezone to UTC to compare
// like with like; the timezone bug itself has a dedicated test.
process.env.TZ = process.env.MTG_TEST_TZ || "UTC";
