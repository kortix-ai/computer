import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { namespace, appName, appPort, domain } from "../config";

interface IngressArgs {
  k8sProvider: k8s.Provider;
  ns: k8s.core.v1.Namespace;
  service: k8s.core.v1.Service;
  albSgId: pulumi.Output<string>;
  acmCertificateArn: string;
}

export function createIngress(args: IngressArgs) {
  const ingress = new k8s.networking.v1.Ingress(
    "kortix-api-ingress",
    {
      metadata: {
        name: `${appName}-ingress`,
        namespace: namespace,
        annotations: {
          "kubernetes.io/ingress.class": "alb",
          "alb.ingress.kubernetes.io/scheme": "internet-facing",
          "alb.ingress.kubernetes.io/target-type": "ip",
          "alb.ingress.kubernetes.io/listen-ports":
            JSON.stringify([{ HTTPS: 443 }]),
          "alb.ingress.kubernetes.io/certificate-arn": args.acmCertificateArn,
          "alb.ingress.kubernetes.io/ssl-policy":
            "ELBSecurityPolicy-TLS13-1-2-2021-06",
          "alb.ingress.kubernetes.io/healthcheck-path": "/v1/health",
          "alb.ingress.kubernetes.io/healthcheck-port": String(appPort),
          "alb.ingress.kubernetes.io/load-balancer-attributes": [
            "idle_timeout.timeout_seconds=3600",
            "routing.http2.enabled=true",
          ].join(","),
          "alb.ingress.kubernetes.io/target-group-attributes": [
            "stickiness.enabled=true",
            "stickiness.type=lb_cookie",
            "stickiness.lb_cookie.duration_seconds=86400",
            "deregistration_delay.timeout_seconds=30",
          ].join(","),
          "alb.ingress.kubernetes.io/security-groups": args.albSgId,
        },
      },
      spec: {
        rules: [
          {
            host: domain,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: appName,
                      port: { number: 80 },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { provider: args.k8sProvider, dependsOn: [args.ns, args.service] },
  );

  return { ingress };
}
