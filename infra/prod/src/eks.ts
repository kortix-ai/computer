import * as eks from "@pulumi/eks";
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
} from "./config";

interface EksArgs {
  vpcId: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string[]>;
  privateSubnetIds: pulumi.Output<string[]>;
}

export function createEksCluster(args: EksArgs) {
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

  const cluster = new eks.Cluster("kortix-eks", {
    name: clusterName,
    version: clusterVersion,
    vpcId: args.vpcId,
    publicSubnetIds: args.publicSubnetIds,
    privateSubnetIds: args.privateSubnetIds,
    endpointPublicAccess: true,
    endpointPrivateAccess: true,
    enabledClusterLogTypes: [
      "api",
      "audit",
      "authenticator",
      "controllerManager",
      "scheduler",
    ],
    createOidcProvider: true,
    skipDefaultNodeGroup: true,
    instanceRoles: [nodeRole],
    tags: commonTags,
  });

  const nodeGroup = new eks.ManagedNodeGroup("kortix-workers", {
    cluster: cluster,
    nodeGroupName: "kortix-workers",
    nodeRole: nodeRole,
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

  return { cluster, nodeGroup };
}
