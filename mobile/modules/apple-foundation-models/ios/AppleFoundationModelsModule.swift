import ExpoModulesCore
import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 * Apple Intelligence for workout drafts.
 *
 * On-device (`SystemLanguageModel`) needs iOS 26 + Apple Intelligence hardware.
 * Private Cloud Compute (`PrivateCloudComputeLanguageModel`) needs the iOS 27
 * SDK at **compile** time (`WORKOUT_APPLE_PCC`), then at runtime: iOS 27, a
 * network, the managed `com.apple.developer.private-cloud-compute` entitlement,
 * and a per–Apple ID daily quota. Xcode 26 builds omit PCC so on-device still
 * links. Personal Team builds also strip the entitlement — stay on-device only.
 */
public class AppleFoundationModelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleFoundationModels")

    AsyncFunction("getAvailability") { () async -> [String: Any] in
      await Self.availability()
    }

    AsyncFunction("tokenCount") { (instructions: String, prompt: String) async -> Int in
      await Self.tokenCount(instructions: instructions, prompt: prompt)
    }

    AsyncFunction("generate") { (instructions: String, prompt: String, kind: String, model: String) async throws -> [String: Any] in
      try await Self.generate(
        instructions: instructions,
        prompt: prompt,
        kind: kind,
        model: model
      )
    }
  }

  private static func availability() async -> [String: Any] {
    var payload: [String: Any] = [
      "onDevice": false,
      "onDeviceReason": "unsupported_os",
      "pcc": false,
      "pccReason": "unsupported_os",
      "onDeviceContextSize": 0,
      "pccContextSize": 0,
      "pccQuotaReached": false,
    ]

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      fillOnDeviceAvailability(&payload)
    }
    fillPccAvailability(&payload)
    #endif

    return payload
  }

  private static func tokenCount(instructions: String, prompt: String) async -> Int {
    let estimate = Int(ceil(Double(instructions.count + prompt.count) / 3.5))
    #if canImport(FoundationModels)
    if #available(iOS 26.4, *) {
      let model = SystemLanguageModel.default
      guard case .available = model.availability else { return estimate }
      let text = instructions + "\n\n" + prompt
      if let counted = try? await model.tokenCount(for: text), counted > 0 {
        return counted
      }
    }
    #endif
    return estimate
  }

  private static func generate(
    instructions: String,
    prompt: String,
    kind: String,
    model: String
  ) async throws -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return try await generateOnSupportedOs(
        instructions: instructions,
        prompt: prompt,
        kind: kind,
        model: model
      )
    }
    #endif
    throw Exception(
      name: "AppleIntelligenceUnavailable",
      description: "Apple Intelligence isn’t available on this iPhone."
    )
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private func fillOnDeviceAvailability(_ payload: inout [String: Any]) {
  let onDevice = SystemLanguageModel.default
  switch onDevice.availability {
  case .available:
    payload["onDevice"] = true
    payload["onDeviceReason"] = NSNull()
    // Published windows: 4k on iOS 26, 8k on iOS 27 silicon. Avoid calling
    // `contextSize` — it is `try await` on 26.4 and a stored Int on 27.
    if #available(iOS 27.0, *) {
      payload["onDeviceContextSize"] = 8192
    } else {
      payload["onDeviceContextSize"] = 4096
    }
  case .unavailable(let reason):
    payload["onDeviceReason"] = stringifyOnDeviceUnavailable(reason)
  @unknown default:
    payload["onDeviceReason"] = "unavailable"
  }
}

private func fillPccAvailability(_ payload: inout [String: Any]) {
  #if WORKOUT_APPLE_PCC
  if #available(iOS 27.0, *) {
    let pcc = PrivateCloudComputeLanguageModel()
    switch pcc.availability {
    case .available:
      payload["pcc"] = true
      payload["pccReason"] = NSNull()
      payload["pccContextSize"] = 32768
      payload["pccQuotaReached"] = pcc.quotaUsage.isLimitReached
    case .unavailable(let reason):
      payload["pccReason"] = stringifyUnavailableDescription(reason)
      payload["pccQuotaReached"] = pcc.quotaUsage.isLimitReached
    @unknown default:
      payload["pccReason"] = "unavailable"
    }
    return
  }
  #endif
  payload["pccReason"] = "unsupported_os"
}

@available(iOS 26.0, *)
@Generable
struct WorkoutTemplateDraft {
  @Guide(description: "Short workout template name.")
  var name: String
  @Guide(description: "Ordered exercises for this single workout. Prefer 3-12.")
  var exercises: [WorkoutExerciseDraft]
}

@available(iOS 26.0, *)
@Generable
struct WorkoutExerciseDraft {
  @Guide(description: "Exact slug from the provided exercise catalog.")
  var slug: String
  @Guide(description: "Per-set weight/reps presets. Prefer 3-5 working sets.")
  var sets: [WorkoutSetDraft]
}

@available(iOS 26.0, *)
@Generable
struct WorkoutSetDraft {
  @Guide(description: "Target weight preset. Use 0 when unknown.")
  var weight: Double
  @Guide(description: "Target reps preset. Use 0 when unknown.")
  var reps: Double
}

@available(iOS 26.0, *)
@Generable
struct WorkoutSessionDraft {
  @Guide(description: "Existing session exercise slugs to remove. Empty if the user only wants additions.")
  var removeSlugs: [String]
  @Guide(description: "New exercises to add. Empty if the user only wants removals.")
  var add: [WorkoutExerciseDraft]
}

@available(iOS 26.0, *)
private func stringifyOnDeviceUnavailable(
  _ reason: SystemLanguageModel.Availability.UnavailableReason
) -> String {
  switch reason {
  case .appleIntelligenceNotEnabled:
    return "appleIntelligenceNotEnabled"
  case .deviceNotEligible:
    return "deviceNotEligible"
  case .modelNotReady:
    return "modelNotReady"
  @unknown default:
    return stringifyUnavailableDescription(reason)
  }
}

private func stringifyUnavailableDescription(_ reason: Any) -> String {
  let text = String(describing: reason).lowercased()
  if text.contains("notenabled") || text.contains("not_enabled") || text.contains("appleintelligencenotenabled") {
    return "appleIntelligenceNotEnabled"
  }
  if text.contains("noteligible") || text.contains("not_eligible") || text.contains("devicenoteligible") {
    return "deviceNotEligible"
  }
  if text.contains("systemnotready") || text.contains("system_not_ready") {
    return "systemNotReady"
  }
  if text.contains("notready") || text.contains("not_ready") || text.contains("modelnotready") {
    return "modelNotReady"
  }
  return "unavailable"
}

@available(iOS 26.0, *)
private func generateOnSupportedOs(
  instructions: String,
  prompt: String,
  kind: String,
  model: String
) async throws -> [String: Any] {
  do {
    if model == "pcc" {
      return try await generateWithPcc(
        instructions: instructions,
        prompt: prompt,
        kind: kind
      )
    }
    return try await generateWithOnDevice(
      instructions: instructions,
      prompt: prompt,
      kind: kind
    )
  } catch let error as Exception {
    throw error
  } catch {
    throw mapGenerateError(error, model: model)
  }
}

@available(iOS 26.0, *)
private func generateWithOnDevice(
  instructions: String,
  prompt: String,
  kind: String
) async throws -> [String: Any] {
  let languageModel = SystemLanguageModel.default
  guard case .available = languageModel.availability else {
    throw Exception(
      name: "AppleIntelligenceUnavailable",
      description: "Apple Intelligence isn’t available on this iPhone."
    )
  }
  let session = LanguageModelSession(model: languageModel, tools: []) {
    instructions
  }
  session.prewarm()
  return try await respond(session: session, prompt: prompt, kind: kind, model: "onDevice")
}

@available(iOS 26.0, *)
private func generateWithPcc(
  instructions: String,
  prompt: String,
  kind: String
) async throws -> [String: Any] {
  #if WORKOUT_APPLE_PCC
  if #available(iOS 27.0, *) {
    let languageModel = PrivateCloudComputeLanguageModel()
    guard case .available = languageModel.availability else {
      throw Exception(
        name: "AppleIntelligenceUnavailable",
        description: "Apple Intelligence cloud isn’t available right now."
      )
    }
    if languageModel.quotaUsage.isLimitReached {
      throw Exception(
        name: "AppleIntelligenceQuota",
        description: "Today’s Apple Intelligence cloud limit is used up. Shorten the description or try tomorrow."
      )
    }
    let session = LanguageModelSession(model: languageModel, tools: []) {
      instructions
    }
    session.prewarm()
    return try await respond(session: session, prompt: prompt, kind: kind, model: "pcc")
  }
  #endif
  throw Exception(
    name: "AppleIntelligenceUnavailable",
    description: "Apple Intelligence cloud needs a newer iOS."
  )
}

@available(iOS 26.0, *)
private func respond(
  session: LanguageModelSession,
  prompt: String,
  kind: String,
  model: String
) async throws -> [String: Any] {
  if kind == "session" {
    let response = try await session.respond(
      to: prompt,
      generating: WorkoutSessionDraft.self
    )
    return [
      "model": model,
      "draft": sessionDictionary(response.content),
    ]
  }
  let response = try await session.respond(
    to: prompt,
    generating: WorkoutTemplateDraft.self
  )
  return [
    "model": model,
    "draft": templateDictionary(response.content),
  ]
}

@available(iOS 26.0, *)
private func templateDictionary(_ draft: WorkoutTemplateDraft) -> [String: Any] {
  [
    "name": draft.name,
    "exercises": draft.exercises.map(exerciseDictionary),
  ]
}

@available(iOS 26.0, *)
private func sessionDictionary(_ draft: WorkoutSessionDraft) -> [String: Any] {
  [
    "removeSlugs": draft.removeSlugs,
    "add": draft.add.map(exerciseDictionary),
  ]
}

@available(iOS 26.0, *)
private func exerciseDictionary(_ exercise: WorkoutExerciseDraft) -> [String: Any] {
  [
    "slug": exercise.slug,
    "sets": exercise.sets.map { set -> [String: Any] in
      ["weight": set.weight, "reps": set.reps]
    },
  ]
}

@available(iOS 26.0, *)
private func contextOverflowDescription(model: String) -> String {
  model == "pcc"
    ? "This request is too large for Apple Intelligence. Shorten the description and try again."
    : "This request is too large for on-device AI. Shorten the description and try again."
}

@available(iOS 26.0, *)
private func isContextOverflowError(_ error: Error) -> Bool {
  if let generation = error as? LanguageModelSession.GenerationError {
    if case .exceededContextWindowSize(_) = generation { return true }
  }
  #if WORKOUT_APPLE_PCC
  if #available(iOS 27.0, *) {
    if let modelError = error as? LanguageModelError {
      if case .contextSizeExceeded(_) = modelError { return true }
    }
  }
  #endif
  // GenerationError's localizedDescription is often "error 4"; the enum
  // case name still shows up in String(describing:).
  let text = "\(error) \(error.localizedDescription)".lowercased()
  return text.contains("exceededcontextwindow")
    || text.contains("contextsizeexceeded")
    || text.contains("context window")
    || text.contains("too large for on-device")
}

@available(iOS 26.0, *)
private func mapGenerateError(_ error: Error, model: String) -> Exception {
  if isContextOverflowError(error) {
    return Exception(
      name: "AppleIntelligenceContext",
      description: contextOverflowDescription(model: model)
    )
  }

  if let generation = error as? LanguageModelSession.GenerationError {
    if case .guardrailViolation(_) = generation {
      return Exception(
        name: "AppleIntelligenceGuardrail",
        description: "Apple Intelligence couldn’t generate that. Try a simpler description."
      )
    }
  }

  #if WORKOUT_APPLE_PCC
  if #available(iOS 27.0, *) {
    if let modelError = error as? LanguageModelError {
      if case .guardrailViolation(_) = modelError {
        return Exception(
          name: "AppleIntelligenceGuardrail",
          description: "Apple Intelligence couldn’t generate that. Try a simpler description."
        )
      }
    }
    if let pccError = error as? PrivateCloudComputeLanguageModel.Error {
      switch pccError {
      case .quotaLimitReached(_):
        return Exception(
          name: "AppleIntelligenceQuota",
          description: "Today’s Apple Intelligence cloud limit is used up. Shorten the description or try tomorrow."
        )
      default:
        break
      }
    }
  }
  #endif

  let text = "\(error) \(error.localizedDescription)".lowercased()
  if text.contains("guardrail") || text.contains("unsafe") {
    return Exception(
      name: "AppleIntelligenceGuardrail",
      description: "Apple Intelligence couldn’t generate that. Try a simpler description."
    )
  }
  if text.contains("quota") {
    return Exception(
      name: "AppleIntelligenceQuota",
      description: "Today’s Apple Intelligence cloud limit is used up. Shorten the description or try tomorrow."
    )
  }
  return Exception(
    name: "AppleIntelligenceFailed",
    description: "Couldn’t generate on this iPhone. Try a clearer description."
  )
}
#endif
