package org.ananas.runner.steprunner.files.utils;

import java.util.Map;
import org.ananas.runner.kernel.model.StepType;
import org.ananas.runner.steprunner.files.FileLoader;

public class StepFileConfigToUrl {

  public static String url(
      StepType type, Map<String, Object> config, FileLoader.SupportedFormat f) {
    return type == StepType.Connector ? (String) config.get("path") : url(config, f);
  }

  public static String gcsSourceUrl(Map<String, Object> config) {
    return String.format("gs://%s/%s", config.get("bucket"), config.get("path"));
  }

  public static String url(Map<String, Object> config, FileLoader.SupportedFormat f) {
    return String.format(
        "%s/%s-%s-of-%s.%s",
        config.get("path"), config.get("prefix"), "00000", "00001", f.name().toLowerCase());
  }
}