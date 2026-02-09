# 🚀 CI/CD Setup Components

## 🔑 1. EC2 Configuration (Run on Server)
SSH into your EC2 instance and run these commands to set up the deployment user and access.

```bash
# 1. Create User
sudo adduser deploy
sudo usermod -aG docker deploy

# 2. Setup SSH directory
sudo mkdir -p /home/deploy/.ssh
sudo touch /home/deploy/.ssh/authorized_keys

# 3. Add Public Key
# COPY & PASTE the line below into: sudo nano /home/deploy/.ssh/authorized_keys
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKkXJAocPHNXNhqJPhjg7pQHQvPdzwokYj6ziW+a1q6b github-actions

# 4. Set Permissions
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

## 🔐 2. GitHub Secrets (Run on GitHub)
Go to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

Add the following 3 secrets:

### `EC2_HOST`
`16.171.152.146`

### `EC2_USER`
`deploy`

### `EC2_SSH_KEY`
Copy the ENTIRE content of the file: `backend/github_actions_ed25519`
*(This file is on your local machine. Open it with standard text editor.)*

---

## 🚀 3. Deploy
Once configured, precise push to `main` branch will trigger the deployment.
```bash
git add .
git commit -m "chore: setup ci/cd"
git push origin main
```
