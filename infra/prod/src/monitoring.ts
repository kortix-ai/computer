import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface MonitoringArgs {
  clusterName: pulumi.Output<string>;
}

export function createMonitoring(args: MonitoringArgs) {
  const addon = new aws.eks.Addon("cloudwatch-observability", {
    clusterName: args.clusterName,
    addonName: "amazon-cloudwatch-observability",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
  });

  return { addon };
}
