import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { clusterName, awsRegion } from "./config";

interface AlbControllerArgs {
  k8sProvider: k8s.Provider;
  albControllerRoleArn: pulumi.Output<string>;
  vpcId: pulumi.Output<string>;
}

export function createAlbController(args: AlbControllerArgs) {
  const chart = new k8s.helm.v3.Chart(
    "aws-load-balancer-controller",
    {
      chart: "aws-load-balancer-controller",
      version: "1.7.2",
      namespace: "kube-system",
      fetchOpts: {
        repo: "https://aws.github.io/eks-charts",
      },
      values: {
        clusterName: clusterName,
        region: awsRegion,
        vpcId: args.vpcId,
        serviceAccount: {
          create: true,
          name: "aws-load-balancer-controller",
          annotations: {
            "eks.amazonaws.com/role-arn": args.albControllerRoleArn,
          },
        },
        enableCertManager: false,
      },
    },
    { provider: args.k8sProvider },
  );

  return { chart };
}
