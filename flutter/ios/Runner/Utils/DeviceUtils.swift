import Foundation
import UIKit

class DeviceUtils {
    static func getUniqueDeviceId() -> String {
        let defaults = UserDefaults.standard
        let key = "device_id"

        if let existingDeviceId = defaults.string(forKey: key) {
            return existingDeviceId
        }

        // Generate new device ID
        let newDeviceId = UUID().uuidString
        defaults.set(newDeviceId, forKey: key)

        return newDeviceId
    }
}
