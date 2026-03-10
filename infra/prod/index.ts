import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { clusterName } from "./src/config";
import { createVpc } from "./src/vpc";
import { createEksCluster } from "./src/eks";
import { createEcrRepository } from "./src/ecr";
import { createIamRoles } from "./src/iam";
import { createSecrets } from "./src/secrets";
import { createAlbController } from "./src/alb-controller";
import { createExternalSecrets } from "./src/external-secrets";
import { createMonitoring } from "./src/monitoring";
import { createNamespace } from "./src/k8s/namespace";
import { createExternalSecret } from "./src/k8s/external-secret";
import { createDeployment } from "./src/k8s/deployment";
import { createService } from "./src/k8s/service";
import { createIngress } from "./src/k8s/ingress";
import { createHpa } from "./src/k8s/hpa";
import { createPdb } from "./src/k8s/pdb";

const config = new pulumi.Config("kortix-eks");
const acmCertificateArn = config.require("acmCertificateArn");
const imageTag = config.get("imageTag") || "latest";

const ghcrImage = "ghcr.io/kortix-ai/computer";

const { vpc, vpcId, publicSubnetIds, privateSubnetIds, albSg } = createVpc();

const { cluster, kubeconfig, oidcProviderUrl, oidcProviderArn } = createEksCluster({
  vpcId,
  publicSubnetIds,
  privateSubnetIds,
  albSgId: albSg.id,
});


const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig,
});

const { repo } = createEcrRepository();
const imageUri = pulumi.interpolate`${ghcrImage}:${imageTag}`;

const { podRole, albControllerRole, esoRole } = createIamRoles({
  oidcProviderUrl,
  oidcProviderArn,
});

const { secret } = createSecrets();

createAlbController({
  k8sProvider,
  albControllerRoleArn: albControllerRole.arn,
  vpcId,
});

const { clusterSecretStore } = createExternalSecrets({
  k8sProvider,
  esoRoleArn: esoRole.arn,
});

createMonitoring({ clusterName: cluster.name });

const { ns } = createNamespace({ k8sProvider });

const { externalSecret } = createExternalSecret({
  k8sProvider,
  clusterSecretStore,
  ns,
});

const ghcrToken = config.getSecret("ghcrToken");

const { deployment } = createDeployment({
  k8sProvider,
  ns,
  externalSecret,
  imageUri,
  podRoleArn: podRole.arn,
  ...(ghcrToken ? { ghcrToken } : {}),
});

const { service } = createService({ k8sProvider, ns });

createIngress({
  k8sProvider,
  ns,
  service,
  albSgId: albSg.id,
  acmCertificateArn,
});

createHpa({ k8sProvider, ns, deployment });
createPdb({ k8sProvider, ns });

export const outputVpcId = vpc.id;
export const eksClusterName = cluster.name;
export const ecrRepositoryUrl = repo.repositoryUrl;
export const secretArn = secret.arn;
export const albDnsName = pulumi.interpolate`Check 'kubectl get ingress -n kortix' for ALB DNS after deploy`;
