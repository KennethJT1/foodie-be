// What the signed-in user liked and follows, for isLiked / isFollowing. Likes and follows arrive
// with the social phase (14); until then nothing is liked or followed.
export const personalFor = async () => ({ likedIds: new Set(), followedIds: new Set() });
