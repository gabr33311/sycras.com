-- Loyalty card: every N finished visits, the next one gets the reward (e.g. a free cut).
-- loyalty_every: null = off, else 5 to 20 visits; loyalty_reward: what the client gets.
alter table public.businesses
  add column if not exists loyalty_every smallint
    check (loyalty_every is null or loyalty_every between 3 and 20),
  add column if not exists loyalty_reward text
    check (loyalty_reward is null or char_length(loyalty_reward) <= 60);
