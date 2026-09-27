export const defaultDb = {
  credentials: {},
  customModels: [],
  favoriteModels: [],
  characters: [
    {
      id: "ayra",
      name: "Ayra",
      identity: {
        faceCut: "Softly oval face with a gently tapered jaw, balanced cheekbones, warm medium-brown complexion, almond-shaped dark brown eyes, defined straight brows, a medium straight nose, softly contoured full lips, and long dark center-parted hair with soft face-framing layers.",
        anchorPrompt: "Preserve Ayra's exact facial identity across every output: softly oval face, tapered jaw, balanced cheekbones, almond dark-brown eyes, straight defined brows, medium straight nose, softly contoured lips, warm medium-brown complexion, and long center-parted dark hair.",
        referenceImages: [],
        identityLocked: true,
        identityLockStrength: 0.9,
        negativeIdentityPrompt: "different person, changed facial identity, altered face shape, altered jawline, different eye shape, different nose, different lips, different skin tone, inconsistent identity",
        notes: "Use an approved face reference with a reference-capable model for the strongest identity consistency."
      },
      preferences: {
        portrait: [],
        "full-body": [],
        fashion: [],
        lifestyle: [],
        restaurant: [],
        travel: [],
        "image editing": [],
        "image-to-video": [],
        "cinematic video": [],
        "social media video": []
      }
    }
  ],
  jobs: [],
  generations: []
};
