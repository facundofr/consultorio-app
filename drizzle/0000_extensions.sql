-- btree_gist lets a GiST exclusion constraint mix "=" on a uuid column with
-- "&&" on a range column (see 0002_appointments_no_overlap.sql).
CREATE EXTENSION IF NOT EXISTS btree_gist;
