import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  clusterName,
  clusterVersion,
  nodeInstanceType,
  nodeMinSize,
  nodeDesiredSize,
  nodeMaxSize,
  nodeDiskSize,
  commonTags,
  awsRegion,
} from "./config";

interface EksArgs {
  vpcId: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string[]>;
  privateSubnetIds: pulumi.Output<string[]>;
  albSgId?: pulumi.Output<string>;
}

export function createEksCluster(args: EksArgs) {
  // --- Cluster IAM Role ---
  const clusterRole = new aws.iam.Role("kortix-cluster-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "eks.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: { ...commonTags, Name: "kortix-cluster-role" },
  });

  const clusterPolicies = [
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
  ];

  clusterPolicies.forEach((policyArn, i) => {
    new aws.iam.RolePolicyAttachment(`kortix-cluster-policy-${i}`, {
      role: clusterRole.name,
      policyArn,
    });
  });

  // --- Worker Node IAM Role ---
  const nodeRole = new aws.iam.Role("kortix-worker-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: { ...commonTags, Name: "kortix-worker-role" },
  });

  const workerPolicies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  ];

  workerPolicies.forEach((policyArn, i) => {
    new aws.iam.RolePolicyAttachment(`kortix-worker-policy-${i}`, {
      role: nodeRole.name,
      policyArn,
    });
  });

  // --- EKS Cluster ---
  const allSubnetIds = pulumi
    .all([args.publicSubnetIds, args.privateSubnetIds])
    .apply(([pub, priv]) => [...pub, ...priv]);

  const cluster = new aws.eks.Cluster("kortix-eks", {
    name: clusterName,
    version: clusterVersion,
    roleArn: clusterRole.arn,
    vpcConfig: {
      subnetIds: allSubnetIds,
      endpointPublicAccess: true,
      endpointPrivateAccess: true,
    },
    enabledClusterLogTypes: [
      "api",
      "audit",
      "authenticator",
      "controllerManager",
      "scheduler",
    ],
    accessConfig: {
      authenticationMode: "API_AND_CONFIG_MAP",
    },
    tags: commonTags,
  });

  // --- OIDC Provider ---
  const oidcThumbprint = cluster.identities.apply((ids) => {
    const url = ids[0].oidcs![0].issuer!;
    // EKS OIDC thumbprint (standard for AWS)
    return "9e99a48a9960b14926bb7f3b02e22da2b0ab7280";
  });

  const oidcProvider = new aws.iam.OpenIdConnectProvider("kortix-oidc", {
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: [oidcThumbprint],
    url: cluster.identities.apply((ids) => ids[0].oidcs![0].issuer!),
    tags: { ...commonTags, Name: "kortix-oidc" },
  });

  // --- Managed Node Group ---
  const nodeGroup = new aws.eks.NodeGroup("kortix-workers", {
    clusterName: cluster.name,
    nodeGroupName: "kortix-workers",
    nodeRoleArn: nodeRole.arn,
    instanceTypes: [nodeInstanceType],
    capacityType: "ON_DEMAND",
    scalingConfig: {
      minSize: nodeMinSize,
      desiredSize: nodeDesiredSize,
      maxSize: nodeMaxSize,
    },
    diskSize: nodeDiskSize,
    subnetIds: args.privateSubnetIds,
    labels: { role: "workers" },
    tags: { ...commonTags, Name: "kortix-worker" },
  });

  // --- Cluster Admin Access ---
  const adminUsers = [
    "arn:aws:iam::935064898258:user/saumya@kortix.com",
    "arn:aws:iam::935064898258:user/pulumi",
  ];

  adminUsers.forEach((userArn, i) => {
    const entry = new aws.eks.AccessEntry(`kortix-admin-access-${i}`, {
      clusterName: cluster.name,
      principalArn: userArn,
    });

    new aws.eks.AccessPolicyAssociation(`kortix-admin-policy-${i}`, {
      clusterName: cluster.name,
      principalArn: entry.principalArn,
      policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
      accessScope: { type: "cluster" },
    });
  });

  // --- ALB -> Pods Security Group Rule ---
  if (args.albSgId) {
    new aws.ec2.SecurityGroupRule("alb-to-pods-8008", {
      type: "ingress",
      securityGroupId: cluster.vpcConfig.clusterSecurityGroupId,
      sourceSecurityGroupId: args.albSgId,
      fromPort: 8008,
      toPort: 8008,
      protocol: "tcp",
      description: "Allow ALB to reach pods on 8008",
    });
  }

  // --- Generate kubeconfig ---
  const kubeconfig = pulumi
    .all([cluster.name, cluster.endpoint, cluster.certificateAuthority])
    .apply(([name, endpoint, ca]) =>
      JSON.stringify({
        apiVersion: "v1",
        kind: "Config",
        clusters: [
          {
            cluster: {
              server: endpoint,
              "certificate-authority-data": ca.data,
            },
            name: "kubernetes",
          },
        ],
        contexts: [
          {
            context: { cluster: "kubernetes", user: "aws" },
            name: "aws",
          },
        ],
        "current-context": "aws",
        users: [
          {
            name: "aws",
            user: {
              exec: {
                apiVersion: "client.authentication.k8s.io/v1beta1",
                command: "aws",
                args: ["eks", "get-token", "--region", awsRegion, "--cluster-name", name, "--output", "json"],
                env: [
                  { name: "AWS_ACCESS_KEY_ID", value: process.env.AWS_ACCESS_KEY_ID || "" },
                  { name: "AWS_SECRET_ACCESS_KEY", value: process.env.AWS_SECRET_ACCESS_KEY || "" },
                  ...(process.env.AWS_SESSION_TOKEN ? [{ name: "AWS_SESSION_TOKEN", value: process.env.AWS_SESSION_TOKEN }] : []),
                ],
              },
            },
          },
        ],
      }),
    );

  return {
    cluster,
    nodeGroup,
    nodeRole,
    kubeconfig,
    oidcProviderUrl: cluster.identities.apply((ids) => ids[0].oidcs![0].issuer!),
    oidcProviderArn: oidcProvider.arn,
  };
}
