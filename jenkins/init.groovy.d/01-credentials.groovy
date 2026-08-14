import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl

def store = com.cloudbees.plugins.credentials.SystemCredentialsProvider.getInstance().getStore()
def domain = Domain.global()

def sshFile = new File('/run/secrets/github_ssh_key')
if (sshFile.exists() && store.getCredentials(domain).find { it.id == 'github-ssh-key' } == null) {
  def sshKey = sshFile.text.trim()
  def sshCred = new BasicSSHUserPrivateKey(
    CredentialsScope.GLOBAL,
    'github-ssh-key',
    'git',
    new BasicSSHUserPrivateKey.DirectEntryPrivateKeySource(sshKey),
    '',
    'GitHub deploy key for Maas repo'
  )
  store.addCredentials(domain, sshCred)
  println('Registered GitHub SSH credential: github-ssh-key')
}

def dockerUser = System.getenv('DOCKERHUB_USER')
def dockerPass = System.getenv('DOCKERHUB_PASS')
if (dockerUser && dockerPass && store.getCredentials(domain).find { it.id == 'dockerhub-credentials' } == null) {
  def dockerCred = new UsernamePasswordCredentialsImpl(
    CredentialsScope.GLOBAL,
    'dockerhub-credentials',
    'Docker Hub credentials for MAAS images',
    dockerUser,
    dockerPass
  )
  store.addCredentials(domain, dockerCred)
  println('Registered Docker Hub credential: dockerhub-credentials')
}
