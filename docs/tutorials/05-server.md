# Tutorial 5: running it on a server

**You'll end up with:** assay running around the clock on a Linux server, restarting itself after a crash or a
reboot, with logs you can read and a way to update it.

**What size of server:** 2 CPUs, 2–4 GB of RAM and 20 GB of disk are plenty (Assay Office runs on a 2-CPU, 3 GB
machine using about 250 MB of RAM). Any provider works; the examples use Ubuntu or Debian.

---

## 1. Install Node.js and git

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version     # v22.18.0 or higher
```

## 2. Get the code and the keys onto the server

```sh
git clone https://github.com/meex-works/assay.git ~/assay
cd ~/assay
npm ci --omit=dev
npm run idl
cp .env.example .env
nano .env          # paste your keys; save with Ctrl+O, exit with Ctrl+X
chmod 600 .env     # only your user can read it
```

> [!IMPORTANT]
> Keys go into `.env` on the server by typing or pasting them there, over SSH. Don't commit them, don't put them in the
> systemd unit, and don't paste them into chats or tickets.

If you set things up on your own computer first, copy only your config changes (`config/assay.yaml`), never your
`data/` folder unless you mean to move the history too.

## 3. Check it

```sh
npm run doctor
```

Fix every `✗`. Then a short dry run, to be sure it works on this machine:

```sh
timeout 90 npm run silent -- --dry
```

You should see the startup lines and at least one status line.

## 4. Install it as a service

systemd keeps it running: it starts it at boot and restarts it within 10 seconds if it ever stops. The repo has a
template:

```sh
sed "s/YOUR_USER/$USER/g" deploy/assay-silent.service | sudo tee /etc/systemd/system/assay-silent.service
sudo systemctl daemon-reload
sudo systemctl enable --now assay-silent
```

Check it's running:

```sh
systemctl status assay-silent          # "active (running)"
journalctl -u assay-silent -f          # the live log; Ctrl+C to stop watching (assay keeps running)
```

If `node` isn't at `/usr/bin/node` on your server (`which node` says), edit `ExecStart` in the unit file to match.

## 5. Updating

```sh
cd ~/assay
git pull
npm ci --omit=dev
npm run doctor
sudo systemctl restart assay-silent
```

A restart is safe. On startup assay rebuilds the last 30 minutes of coins from the database and resumes watching
any posted coin that's still inside its 15 minutes, so posts keep getting edited:

```
resumed 862 coins and 2 watches from disk
```

## 6. Backups

Everything is in one file, `data/assay.db` (SQLite). Back it up with SQLite's online backup, which is safe while
assay is running:

```sh
sqlite3 ~/assay/data/assay.db ".backup '/home/$USER/assay-backup-$(date +%F).db'"
```

Or once a day from cron:

```sh
crontab -e
# add:
15 3 * * * sqlite3 /home/YOUR_USER/assay/data/assay.db ".backup '/home/YOUR_USER/backups/assay-$(date +\%F).db'"
```

(`sudo apt-get install -y sqlite3` if the command is missing.)

The file grows by roughly 100–300 MB a day; trades older than `store.keep_trades_days` (8) are pruned automatically.

## 7. Stopping it

```sh
sudo systemctl stop assay-silent       # until you start it again
sudo systemctl disable assay-silent    # and not at boot either
```

## Using the macOS Keychain instead of `.env`

assay also reads keys from the macOS Keychain, which is how Assay Office's own Mac stores them. On Linux there's no
Keychain, but a small stand-in script named `security` can read `~/.secrets/<service>.<account>` files instead (see
the table at the end of [Tutorial 2](02-keys.md)). `.env` is simpler; use it unless you already have the stand-in.

**Next:** [Tutorial 6: the website](06-website.md), or [Tutorial 7: operating it](07-operating.md).
